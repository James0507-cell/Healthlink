import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HealthLink",
    template: "%s | HealthLink",
  },
  description:
    "An interoperable patient referral and health information exchange system for selected healthcare facilities in Davao City. FHIR-based referral exchange, consent management and closed-loop status tracking.",
  applicationName: "HealthLink",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#235453",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-PH">
      <body>{children}</body>
    </html>
  );
}
