declare module "@clerk/ui" {
  import type { Appearance, Ui } from "@clerk/ui/internal";

  export const ui: Ui<Appearance>;
  export type { Appearance };
}
