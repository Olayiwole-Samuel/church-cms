"use client";

import { ComponentProps } from "react";

/** A menu that applies straight away, as iOS menus do, with no separate submit button. */
export function AutoSelect(props: ComponentProps<"select">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
