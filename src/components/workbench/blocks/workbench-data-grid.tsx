"use client";

import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";

import {
  DataGrid,
  DataGridContainer,
} from "@/components/reui/data-grid/data-grid";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { cn } from "@/lib/utils";

/** ReUI DataGrid shell — dense mono headers matching Stitch eval/training tables. */
export function WorkbenchDataGrid<T extends object>({
  columns,
  data,
  emptyMessage,
  className,
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  emptyMessage: React.ReactNode;
  className?: string;
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <DataGridContainer className={cn("overflow-hidden rounded-lg", className)}>
      <DataGrid
        table={table}
        recordCount={data.length}
        emptyMessage={emptyMessage}
        tableLayout={{
          rowBorder: true,
          headerBorder: true,
          headerBackground: true,
          headerSticky: true,
          stripped: true,
          dense: true,
        }}
        tableClassNames={{
          headerRow:
            "font-mono text-[10px] tracking-wide uppercase text-muted-foreground",
          bodyRow: "text-[12px]",
        }}
      >
        <DataGridTable />
      </DataGrid>
    </DataGridContainer>
  );
}
