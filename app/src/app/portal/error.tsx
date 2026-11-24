"use client";

import { ErrorState } from "@/components/app/states";
import { Button } from "@/components/ui/button";

export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState>
      <Button onClick={() => reset()}>Tentar de novo</Button>
    </ErrorState>
  );
}
