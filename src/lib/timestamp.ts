/** Drop-in replacement for Firestore Timestamp (millisecond precision). */
export class Timestamp {
  private constructor(private readonly ms: number) {}

  static now(): Timestamp {
    return new Timestamp(Date.now());
  }

  static fromDate(d: Date): Timestamp {
    return new Timestamp(d.getTime());
  }

  static fromMillis(ms: number): Timestamp {
    return new Timestamp(ms);
  }

  toDate(): Date {
    return new Date(this.ms);
  }

  toMillis(): number {
    return this.ms;
  }
}
