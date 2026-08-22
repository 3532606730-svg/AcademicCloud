declare module "citeproc" {
  interface CiteprocSystem {
    retrieveItem(id: string): Record<string, unknown>;
    retrieveLocale(language: string): string;
  }

  interface CitationItem {
    id: string;
    locator?: string;
    label?: string;
  }

  interface CitationCluster {
    citationID: string;
    citationItems: CitationItem[];
    properties: { noteIndex: number };
  }

  type CitationUpdate = [number, string, string];

  class Engine {
    constructor(system: CiteprocSystem, style: string, language?: string, forceLanguage?: boolean);
    setOutputFormat(format: "text" | "html" | "rtf"): void;
    updateItems(ids: string[]): void;
    processCitationCluster(
      citation: CitationCluster,
      citationsPre: Array<[string, number]>,
      citationsPost: Array<[string, number]>,
    ): [Record<string, unknown>, CitationUpdate[]];
    makeBibliography(): [Record<string, unknown>, string[]] | false;
  }

  const CSL: {
    Engine: typeof Engine;
    PROCESSOR_VERSION: string;
  };

  export default CSL;
}
