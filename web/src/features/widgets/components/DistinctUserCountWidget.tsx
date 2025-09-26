import React, { useMemo } from "react";
import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";
import { mapLegacyUiTableFilterToView } from "@/src/features/query";
import { type z } from "zod";
import { type views, type metricAggregations } from "@/src/features/query";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { 
  dashboardDateRangeAggregationSettings,
  type DashboardDateRangeAggregationOption 
} from "@/src/utils/date-range-utils";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";

interface DistinctUserCountWidgetProps {
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  agg: DashboardDateRangeAggregationOption;
  className?: string;
  isLoading?: boolean;
}

export function DistinctUserCountWidget({
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  agg,
  className,
  isLoading = false,
}: DistinctUserCountWidgetProps) {
  // Query for total distinct users count
  const totalCountQuery = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: {
        view: "traces" as z.infer<typeof views>,
        dimensions: [{ field: "userId" }],
        metrics: [
          {
            measure: "count",
            aggregation: "count" as z.infer<typeof metricAggregations>,
          },
        ],
        filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
        timeDimension: null,
        fromTimestamp: fromTimestamp.toISOString(),
        toTimestamp: toTimestamp.toISOString(),
        orderBy: null,
        chartConfig: {
          type: "NUMBER",
        },
      },
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !isLoading,
    },
  );

  // Query for time series data of distinct users
  const timeSeriesQuery = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: {
        view: "traces" as z.infer<typeof views>,
        dimensions: [{ field: "userId" }],
        metrics: [
          {
            measure: "count",
            aggregation: "count" as z.infer<typeof metricAggregations>,
          },
        ],
        filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
        timeDimension: {
          granularity: dashboardDateRangeAggregationSettings[agg].date_trunc,
        },
        fromTimestamp: fromTimestamp.toISOString(),
        toTimestamp: toTimestamp.toISOString(),
        orderBy: null,
      },
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !isLoading,
    },
  );

  const totalUserCount = totalCountQuery.data?.length || 0;

  const timeSeriesData = useMemo(() => {
    if (!timeSeriesQuery.data) return [];
    
    // Group by time dimension and count distinct users per time period
    const groupedByTime = timeSeriesQuery.data.reduce<
      Record<number, Set<string>>
    >((acc, item) => {
      const ts = new Date(item.time_dimension as any).getTime();
      const userId = item.userId as string;
      
      if (!acc[ts]) {
        acc[ts] = new Set();
      }
      if (userId) {
        acc[ts].add(userId);
      }
      
      return acc;
    }, {});
    
    // Transform to the expected format
    return Object.entries(groupedByTime).map(([timestamp, userIds]) => ({
      ts: Number(timestamp),
      values: [
        {
          label: "Distinct Users",
          value: userIds.size,
        },
      ],
    }));
  }, [timeSeriesQuery.data]);

  const hasData = timeSeriesData.length > 0;

  return (
    <DashboardCard
      className={className}
      title="Distinct Users"
      isLoading={isLoading || totalCountQuery.isLoading || timeSeriesQuery.isLoading}
    >
      <div className="flex flex-col gap-4">
        {/* Total count metric */}
        <div className="flex justify-center">
          <TotalMetric
            metric={compactNumberFormatter(totalUserCount || 0)}
            description="Total distinct users"
          />
        </div>
        
        {/* Time series chart */}
        {hasData ? (
          <BaseTimeSeriesChart
            agg={agg}
            data={timeSeriesData}
            showLegend={false}
            connectNulls={true}
            valueFormatter={compactNumberFormatter}
            chartType="line"
          />
        ) : (
          <NoDataOrLoading
            isLoading={isLoading || timeSeriesQuery.isLoading}
            description="No user data available for the selected time period"
          />
        )}
      </div>
    </DashboardCard>
  );
}
