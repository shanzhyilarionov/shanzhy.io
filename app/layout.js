import { Inter } from "next/font/google";
import Shell from "../components/shell";
import EntryLoading from "../components/entry-loading";
import { motionVariables } from "../styles/animations.mjs";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata = {
  metadataBase: new URL("https://shanzhy.io"),
  alternates: {
    canonical: "/",
  },
  title: {
    default: "Shanzhy",
    template: "%s | Shanzhy",
  },
  description: "Shanzhy Ilarionov is an independent developer based in Edmonton, Canada, focused on software engineering and user experience design.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} style={motionVariables}>
      <body className="min-h-full flex flex-col">
        <EntryLoading>
          <Shell>{children}</Shell>
        </EntryLoading>
      </body>
    </html>
  );
}
