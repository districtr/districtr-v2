import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Districtr 2.0",
  description: "Districtr reboot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Theme
          accentColor="indigo"
          grayColor="gray"
          radius="large"
          scaling="95%"
        >
          {children}
        </Theme>
      </body>
    </html>
  );
}
