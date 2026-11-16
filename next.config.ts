import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit", "bcryptjs", "@prisma/client"],
};

export default nextConfig;
