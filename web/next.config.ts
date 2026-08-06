import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs is CommonJS and pulls in Node built-ins; let Node require it at
  // runtime instead of trying to bundle it into the server build.
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
