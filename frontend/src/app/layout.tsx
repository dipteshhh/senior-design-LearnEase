import "./globals.css";
import AppShell from "@/components/shell/AppShell";

export const metadata = {
  title: "LearnEase",
  description: "Accessibility-first document understanding",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
