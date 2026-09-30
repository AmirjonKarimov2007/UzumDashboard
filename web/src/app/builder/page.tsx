import { Suspense } from "react";
import { BuilderClient } from "./builder-client";

export default function BuilderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#fffdf8]" />}>
      <BuilderClient />
    </Suspense>
  );
}
