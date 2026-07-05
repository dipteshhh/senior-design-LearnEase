import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "LearnEase",
  description: "Study smarter, not harder",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
