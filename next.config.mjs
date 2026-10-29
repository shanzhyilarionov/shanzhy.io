/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  images: {
    qualities: [75, 90],
    localPatterns: [
      { pathname: "/**", search: "" },
      { pathname: "/images/shanzhy.png" },
    ],
  },
};

export default nextConfig;
