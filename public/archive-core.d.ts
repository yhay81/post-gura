export type ArchivePost = {
  createdAt: string | null;
  id: string;
  kind: "bookmark" | "like" | "note" | "post" | "reply" | "repost";
  source?: string;
  text: string;
  url?: string;
};

export type ParsedArchive = {
  ignoredEntries: number;
  posts: ArchivePost[];
  selectedFiles: string[];
  warnings: string[];
};

export function isSupportedArchiveFile(name: string): boolean;
export function isZipFile(file: File): boolean;
export function extractJsonValue(text: string): unknown;
export function dateFromSnowflake(id: string): string | null;
export function normalizeArchiveValue(value: unknown, name: string): ArchivePost[];
export function parseArchiveFiles(
  files: Iterable<File>,
  onProgress?: (message: string) => void,
): Promise<ParsedArchive>;
export function filterPosts(
  posts: ArchivePost[],
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    kind?: string;
    query?: string;
    sort?: string;
    year?: string;
  },
): ArchivePost[];
export function countByYear(posts: ArchivePost[]): Array<[string, number]>;
export function postsToCsv(posts: ArchivePost[]): string;
