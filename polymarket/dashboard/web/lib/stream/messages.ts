export type ClientMessage =
  | { type: "subscribe.books"; asset_ids: string[] }
  | { type: "unsubscribe.books"; asset_ids: string[] }
  | { type: "resume"; since_t: number }
  | { type: "ping" };
