import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { connection } from "next/server";
import { getServerApiClient, getServerQueryClient } from "@/lib/server-api";
import { loadTaskSearch } from "@/lib/task-search";
import { TaskWorkbench } from "./task-workbench";
import { WorkbenchStoreProvider } from "./workbench-store-provider";

export async function TaskWorkbenchServer({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The demo repository is process-local, so never snapshot it into the build cache.
  await connection();
  const input = await loadTaskSearch(searchParams);
  const queryClient = getServerQueryClient();
  const serverOrpc = createTanstackQueryUtils(getServerApiClient());
  await queryClient.fetchQuery(serverOrpc.tasks.list.queryOptions({ input }));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <WorkbenchStoreProvider>
        <TaskWorkbench />
      </WorkbenchStoreProvider>
    </HydrationBoundary>
  );
}
