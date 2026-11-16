import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { usingDefaultSecret } from "@/lib/secret";
import { ensureSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await ensureSettings();
  return (
    <Shell
      user={{ name: user.name, email: user.email, role: user.role }}
      company={settings.companyName}
      mustChangePassword={user.mustChangePassword}
      demoSecret={usingDefaultSecret()}
    >
      {children}
    </Shell>
  );
}
