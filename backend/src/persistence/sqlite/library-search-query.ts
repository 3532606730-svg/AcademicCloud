import { normalizeForMatch, type LibrarySearchSort, type PreparedSearch } from "../../library/search.js";
import { searchTextOrder } from "../../library/search-projection.js";

const filters = ["contributor", "language", "publisher", "year", "dynasty", "reignTitle", "series", "volume"] as const;

function sortExpressions(sort: LibrarySearchSort): string[] {
  if (sort === "relevance") return ["match_rank", "file_order"];
  if (sort === "newest" || sort === "oldest") return ["created_sort", "artifact_order", "file_order"];
  if (sort === "title_asc" || sort === "title_desc") return ["pinyin_order", "title_order", "file_order"];
  return ["size_sort", "file_order"];
}

export function librarySearchSql(holdingFrom: string, holdingColumns: string, sort: LibrarySearchSort): string {
  const descending = ["newest", "title_desc", "size_desc"].includes(sort);
  const direction = descending ? "DESC" : "ASC";
  const comparator = descending ? "<" : ">";
  const terms = sortExpressions(sort);
  const after = terms.map((term, index) => `(${[
    ...terms.slice(0, index).map((prior, position) => `${prior} = @after${position}`),
    `${term} ${comparator} @after${index}`,
  ].join(" AND ")})`).join(" OR ");
  const titleSort = sort === "title_asc" || sort === "title_desc";
  return `
    WITH ranked AS MATERIALIZED (
      SELECT files.id AS candidate_file_id, scholarly_artifacts.id AS candidate_artifact_id,
        search_text_order(files.id) AS file_order,
        ${sort === "newest" || sort === "oldest"
          ? "search_epoch(scholarly_artifacts.created_at) AS created_sort, search_text_order(scholarly_artifacts.id) AS artifact_order,"
          : ""}
        ${sort === "size_asc" || sort === "size_desc" ? "files.size_bytes AS size_sort," : ""}
        ${titleSort ? `
          CASE WHEN p.canonical_title IS NULL THEN search_text_order(pinyin_key(files.display_name)) ELSE p.pinyin_order END AS pinyin_order,
          CASE WHEN p.canonical_title IS NULL THEN search_text_order(files.display_name) ELSE p.title_order END AS title_order,
        ` : ""}
        CASE
          WHEN @queryCompact = '' THEN 0
          WHEN p.title_compact <> '' AND p.title_compact = @queryCompact THEN 0
          WHEN p.title_compact <> '' AND instr(p.title_compact, @queryCompact) > 0 THEN 1
          WHEN instr(p.people_text, ' ' || @queryCompact || ' ') > 0 THEN 2
          WHEN instr(p.people_text, @queryCompact) > 0
            OR (@combinedQuery = 1 AND search_combined(p.people_json, p.title_compact, @query) = 1) THEN 3
          WHEN instr(p.identifiers_text, ' ' || @queryCompact || ' ') > 0 THEN 4
          WHEN instr(p.other_text, @queryCompact) > 0 THEN 5
          WHEN instr(search_normalize(files.display_name), @queryCompact) > 0 THEN 6
          ELSE -1
        END AS match_rank
      ${holdingFrom}
      JOIN scholarly_search_projection p
        ON p.record_id = scholarly_records.id AND p.owner_domain_id = libraries.owner_domain_id
      WHERE libraries.id = @libraryId
        AND (@materialClass IS NULL OR json_extract(p.filters_json, '$.materialClass') = @materialClass)
        AND (@editionType IS NULL OR EXISTS(SELECT 1 FROM json_each(p.filters_json, '$.editionType') WHERE value = @editionType))
        ${filters.map((field) => `AND (@${field} IS NULL OR EXISTS(SELECT 1 FROM json_each(p.filters_json, '$.${field}') WHERE instr(value, @${field}) > 0))`).join("\n")}
        AND (@editorialRole IS NULL
          OR EXISTS(SELECT 1 FROM json_each(p.filters_json, '$.editorialRoleExact') WHERE value = @editorialRole)
          OR EXISTS(SELECT 1 FROM json_each(p.filters_json, '$.editorialRoleLabel') WHERE instr(value, @editorialRole) > 0))
    ), candidates AS MATERIALIZED (
      SELECT * FROM ranked
      WHERE match_rank >= 0 AND (@hasAfter = 0 OR ${after})
      ORDER BY ${terms.map((term) => `${term} ${direction}`).join(", ")}
      LIMIT @limit
    )
    SELECT ${holdingColumns}, candidates.match_rank
    ${holdingFrom}
    JOIN candidates ON candidates.candidate_file_id = files.id
      AND candidates.candidate_artifact_id = scholarly_artifacts.id
    WHERE libraries.id = @libraryId
    ORDER BY ${terms.map((term) => `candidates.${term} ${direction}`).join(", ")}
  `;
}

export function librarySearchParameters(libraryId: string, search: PreparedSearch): Record<string, string | number | null> {
  const parameters: Record<string, string | number | null> = {
    libraryId, query: search.query, queryCompact: search.queryCompact, limit: search.limit + 1,
    combinedQuery: search.query.split(/\s+/u).filter(Boolean).length >= 2 ? 1 : 0,
    hasAfter: search.after ? 1 : 0,
    materialClass: search.filters.materialClass ?? null, editionType: search.filters.editionType ?? null,
    editorialRole: search.filters.editorialRole === undefined ? null : normalizeForMatch(search.filters.editorialRole),
  };
  for (const field of filters) parameters[field] = search.filters[field] === undefined ? null : normalizeForMatch(search.filters[field]);
  for (let index = 0; index < sortExpressions(search.sort).length; index += 1) {
    const value = search.after?.key[index];
    parameters[`after${index}`] = value === undefined ? null : typeof value === "string" ? searchTextOrder(value) : value;
  }
  return parameters;
}
