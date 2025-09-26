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
import { 
  extractTimeSeriesData, 
  fillMissingValuesAndTransform 
} from "@/src/features/dashboard/components/hooks";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";

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
    
    // Use the helper functions to properly process time series data with dimensions
    const extractedData = extractTimeSeriesData(
      timeSeriesQuery.data as DatabaseRow[],
      "time_dimension",
      [
        {
          uniqueIdentifierColumns: [{ accessor: "userId" }],
          valueColumn: "count_count",
        },
      ],
    );
    
    // Group by time and count distinct users per time period
    const groupedByTime = new Map<number, Set<string>>();
    
    extractedData.forEach((chartData, timestamp) => {
      if (!groupedByTime.has(timestamp)) {
        groupedByTime.set(timestamp, new Set());
      }
      
      chartData.forEach((data) => {
        // Extract userId from the label (which is the userId)
        const userId = data.label;
        if (userId) {
          groupedByTime.get(timestamp)!.add(userId);
        }
      });
    });
    
    // Transform to the expected format
    const result = Array.from(groupedByTime.entries()).map(([timestamp, userIds]) => ({
      ts: timestamp,
      values: [
        {
          label: "Distinct Users",
          value: userIds.size,
        },
      ],
    }));
    
    return fillMissingValuesAndTransform(
      new Map(result.map(item => [item.ts, item.values])),
      ["Distinct Users"]
    );
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
