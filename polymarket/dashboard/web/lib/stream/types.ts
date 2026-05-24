import type { z } from "zod";

import * as schemas from "./schemas";

export type Decimalish = z.infer<typeof schemas.Decimalish>;
export type Side = z.infer<typeof schemas.Side>;
export type WhaleTrade = z.infer<typeof schemas.WhaleTrade>;
export type WhaleSignal = z.infer<typeof schemas.WhaleSignal>;
export type SignalKey = z.infer<typeof schemas.SignalKey>;
export type BookLevel = z.infer<typeof schemas.BookLevel>;
export type BookDelta = z.infer<typeof schemas.BookDelta>;
export type WhalePosition = z.infer<typeof schemas.WhalePosition>;
export type Heartbeat = z.infer<typeof schemas.Heartbeat>;
export type StreamEvent = z.infer<typeof schemas.StreamEvent>;
