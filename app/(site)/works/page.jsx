import Works from "./works";

export const metadata = {
  title: "Works",
  description: null,
  alternates: {
    canonical: "/works",
  },
  robots: {
    nosnippet: true,
  },
};

export default function WorksPage() {
  return <Works />;
}
