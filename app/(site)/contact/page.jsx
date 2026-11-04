import Contact from "./contact";

export const metadata = {
  title: "Contact",
  description: null,
  alternates: {
    canonical: "/contact",
  },
  robots: {
    nosnippet: true,
  },
};

export default function ContactPage() {
  return <Contact />;
}
