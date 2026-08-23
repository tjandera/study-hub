import { AppShell } from "@/components/app-shell";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { TabsProvider } from "@/components/tabs-provider";

export default function HubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider>
      <TabsProvider>
        <AppShell>{children}</AppShell>
      </TabsProvider>
    </WorkspaceProvider>
  );
}
