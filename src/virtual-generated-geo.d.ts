declare module 'virtual:generated-geo' {
  type ScenarioGeometryUrls = {
    readonly provinces: string;
    readonly nationalBorders: string;
    readonly rivers: string;
    readonly lakes: string;
  };

  /** Content-hashed geometry paths keyed by Scenario ID, with no BASE_URL prefix. */
  export const SCENARIO_GEO_URLS: Readonly<Record<string, ScenarioGeometryUrls>>;
}
