export namespace RoutePattern {
  /**
   * Converts a real path like /user/john to its route pattern /user/:username.
   * Works per whole segment, so a param value never replaces a part of another segment.
   */
  export function fromPath(pathname: string, params: Readonly<Record<string, string | undefined>>): string {
    const paramNameByValue = new Map<string, string>();
    for (const [name, value] of Object.entries(params)) {
      if (!value) continue;
      paramNameByValue.set(value, name);
      paramNameByValue.set(encodeURIComponent(value), name);
    }

    return pathname
      .split("/")
      .map(function toPatternSegment(segment) {
        const name = paramNameByValue.get(segment);
        return name ? `:${name}` : segment;
      })
      .join("/");
  }
}
