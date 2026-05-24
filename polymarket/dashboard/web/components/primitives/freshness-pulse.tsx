"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

export interface FreshnessPulseProps {
  active: boolean;
  children: React.ReactNode;
  className?: string;
  intensity?: number;
}

export function FreshnessPulse({
  active,
  children,
  className,
  intensity = 1,
}: FreshnessPulseProps): React.ReactNode {
  const prefersReducedMotion = useReducedMotion();

  if (!active || prefersReducedMotion) {
    return children;
  }

  return (
    <motion.div
      data-testid="freshness-pulse"
      className={className}
      animate={{ scale: [1, 1 + 0.005 * intensity, 1] }}
      transition={{
        duration: 1.2,
        ease: "easeInOut",
        repeat: Infinity,
      }}
    >
      {children}
    </motion.div>
  );
}
