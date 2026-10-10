import { useState } from "react";
import type { CatalogApplyResult, CatalogFieldDiff, CatalogPreview, CatalogPreviewItem } from "./api.ts";
import { useLanguage } from "./i18n-react.tsx";
import type { MessageKey } from "./i18n.ts";

export interface ReviewAcknowledgements { evidence: boolean; humanConflict: boolean; clear: boolean }
export const EMPTY_ACKNOWLEDGEMENTS: ReviewAcknowledgements = { evidence: false, humanConflict: false, clear: false };
const LABELS: Record<string, [string, string]> = {
  canonicalTitle: ["题名", "Title"], subtitle: ["副题名", "Subtitle"], alternativeTitles: ["其他题名", "Other titles"],
  materialType: ["资料类型", "Resource type"], materialClass: ["文献类别", "Material class"], contributors: ["责任者", "Contributors"],
  dateStatement: ["日期说明", "Date statement"], identifiers: ["标识符", "Identifiers"], series: ["丛书", "Series"], volume: ["卷册", "Volume"], language: ["语种", "Language"],
  "publication.publisher": ["出版社", "Publisher"], "publication.place": ["出版地", "Publication place"], "publication.publicationDate": ["出版日期", "Publication date"],
  "publication.editionNumber": ["版次", "Edition number"], "publication.printing": ["印次", "Printing"],
  "carrierEdition.editionType": ["载体版本类型", "Carrier edition type"], "carrierEdition.editionStatement": ["载体版本说明", "Carrier edition"],
  "carrierEdition.facsimileStatement": ["影印来源说明", "Facsimile provenance"],
  "sourceEdition.dynasty": ["原本朝代", "Source dynasty"], "sourceEdition.reignTitle": ["原本年号", "Source reign"], "sourceEdition.reignYear": ["年号纪年", "Reign year"],
  "sourceEdition.absoluteYear": ["原本公历年", "Source year"], "sourceEdition.printer": ["刻印者", "Source printer"], "sourceEdition.imprint": ["原本刊记", "Source imprint"],
  "sourceEdition.bookshop": ["书坊", "Bookshop"], "sourceEdition.institution": ["刊印机构", "Source institution"], "sourceEdition.printingPlace": ["刊印地", "Source printing place"],
  "sourceEdition.editionType": ["原本版本类型", "Source edition type"], "sourceEdition.editionStatement": ["原本版本说明", "Source edition"],
  "sourceEdition.holdingInformation": ["原本藏本信息", "Source holding information"], typeFields: ["专属类型信息", "Type-specific fields"],
  authorityLinks: ["规范名称关联", "Authority links"], displayName: ["文件显示名", "Display filename"],
};
const STATUS: Record<string, [string, string]> = {
  auto: ["待确认", "For confirmation"], review: ["需要审核", "Needs review"], unknown: ["信息不足", "Insufficient information"],
  excluded: ["不参与编目", "Excluded"], stale: ["资料已变化", "Source changed"], collision: ["名称冲突", "Name collision"], unchanged: ["无需修改", "Unchanged"],
  applied: ["已应用", "Applied"], not_found: ["资料不可用", "Resource unavailable"], invalid_input: ["建议不可应用", "Cannot apply suggestion"],
  conflict: ["存在冲突", "Conflict"], acknowledgement_required: ["需要确认审核事项", "Review acknowledgements required"],
  preserve: ["保留现值", "Preserve current"], set: ["设置新值", "Set value"], clear: ["明确清空", "Explicit clear"],
  unsupported: ["此处不支持，保留现值", "Unsupported here; preserve current"],
  human: ["人工确认", "Human confirmed"], ai: ["AI 建议", "AI suggestion"], unattributed: ["既有值，未标注权威", "Existing, unattributed"], none: ["未设置", "Not set"],
  unverified: ["外部证据，需人工核对", "External evidence; verify manually"], insufficient: ["证据不足", "Insufficient evidence"], failed: ["提取失败", "Extraction failed"],
};

export function canSelectCatalogItem(item: CatalogPreviewItem): boolean { return item.category === "review" || item.category === "auto"; }

function FieldTable({ fields }: { fields: CatalogFieldDiff[] }) {
  const { language, t } = useLanguage();
  const zh = language === "zh-CN";
  const label = (key: string) => LABELS[key]?.[zh ? 0 : 1] ?? (zh ? "资料信息" : "Resource information");
  const status = (key: string) => STATUS[key]?.[zh ? 0 : 1] ?? (zh ? "需要审核" : "Needs review");
  function value(input: unknown, field: string): string {
    if (input === null || input === undefined || input === "") return "—";
    if (Array.isArray(input)) return input.length ? input.map((entry) => value(entry, field)).join("；") : "—";
    if (typeof input === "object") {
      const row = input as Record<string, unknown>;
      if (typeof row.label === "string") {
        const responsibility = typeof row.roleLabel === "string" && row.roleLabel.trim()
          ? row.roleLabel : typeof row.role === "string" ? t(`contributorRole.${row.role}` as MessageKey) : "";
        return `${row.label}${responsibility ? ` · ${responsibility}` : ""}`;
      }
      if (typeof row.scheme === "string" && typeof row.value === "string") return `${row.scheme.toUpperCase()}: ${row.value}`;
      const entries = Object.entries(row).filter(([key]) => !["id", "authorityId", "ownerDomainId"].includes(key));
      return entries.length ? entries.map(([key, val]) => `${label(key)}: ${value(val, key)}`).join("；") : "—";
    }
    if (field === "materialClass") return t(`materialClass.${String(input)}` as MessageKey);
    if (field.endsWith("editionType")) return t(`editionType.${String(input)}` as MessageKey);
    if (field === "materialType") return ({ book: zh ? "图书" : "Book", article: zh ? "文章" : "Article", manuscript: zh ? "手稿" : "Manuscript",
      inscription: zh ? "碑刻" : "Inscription", archival_document: zh ? "档案" : "Archival document" } as Record<string, string>)[String(input)] ?? String(input);
    return String(input);
  }
  return <div className="catalog-field-table" role="table" aria-label={zh ? "将应用的字段差异" : "Field changes to apply"}>
    <div role="row" className="catalog-field-header"><span role="columnheader">{zh ? "字段与处理" : "Field / action"}</span><span role="columnheader">{zh ? "当前" : "Current"}</span><span role="columnheader">{zh ? "确认后" : "After confirmation"}</span></div>
    {fields.map((field) => <div role="row" className="catalog-field-row" data-operation={field.operation} key={field.field}>
      <div role="cell"><strong>{label(field.field)}</strong><small>{status(field.operation)}</small>
        {field.notes === "material_type_preserved_with_type_fields" && <small>{zh ? "既有专属类型信息需要在资料编辑中处理。" : "Existing type-specific facts require the resource editor."}</small>}</div>
      <div role="cell"><span>{value(field.currentValue, field.field)}</span><small>{status(field.currentAuthority)}</small></div>
      <div role="cell"><span>{value(field.proposedValue, field.field)}</span><small>{status(field.proposedAuthority)}</small></div>
    </div>)}
  </div>;
}

function ReviewItem({ item, selected, busy, completed, onToggle }: { item: CatalogPreviewItem; selected: boolean; busy: boolean; completed: boolean; onToggle: () => void }) {
  const { language, t } = useLanguage();
  const zh = language === "zh-CN";
  const [expanded, setExpanded] = useState(false);
  const [showPreserved, setShowPreserved] = useState(false);
  const changes = item.fields.filter((field) => !["preserve", "unchanged"].includes(field.operation));
  const warnings = item.warnings.filter((warning) => warning !== "unverified_evidence");
  return <article className="catalog-review-item" data-status={item.category}>
    <header>
      <label className="catalog-review-select"><input type="checkbox" disabled={busy || completed || !canSelectCatalogItem(item)} checked={selected} onChange={onToggle} />
        <strong>{item.currentFilename}</strong></label>
      <span className="catalog-status">{STATUS[completed ? "applied" : item.category]?.[zh ? 0 : 1]}</span>
    </header>
    <p className="catalog-proposed-name">{item.proposedFilename ? `→ ${item.proposedFilename}` : zh ? "保留当前文件名" : "Keep current filename"}</p>
    <div className="catalog-review-summary"><span>{zh ? `${changes.length} 个字段变化` : `${changes.length} field changes`}</span>
      <span>{item.identityMatch ? zh ? "来源身份一致" : "Source identity matches" : zh ? "来源已变化，不可应用" : "Source changed; cannot apply"}</span>
      <span>{STATUS[item.evidence.state]?.[zh ? 0 : 1]}</span></div>
    {item.notes && <p className="catalog-review-note">{item.notes}</p>}
    {warnings.length > 0 && <ul className="catalog-review-warnings">{warnings.map((warning) => <li key={warning}>{
      warning === "invalid_isbn_removed" || warning === "internal_test_resource_excluded" ? t(`batchCatalog.warning.${warning}`)
        : warning === "legacy_preserve_semantics" ? zh ? "旧格式中缺失或空值的字段将保留现值。" : "Missing or empty legacy fields preserve existing values."
          : warning === "missing_required_title" ? zh ? "缺少可用题名，请修正结果后重新导入。" : "A usable title is required; correct and reimport the results."
            : warning === "missing_required_material_type" ? zh ? "资料类型未确定，请核对原页后补充。" : "Resource type is unresolved; check the source pages before completing it."
            : zh ? "外部证据需要人工核对。" : "External evidence requires human review."
    }</li>)}</ul>}
    {item.evidence.notes && item.evidence.notes !== item.notes && <p className="catalog-review-note">{item.evidence.notes}</p>}
    <button type="button" className="button button--quiet button--small" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      {expanded ? zh ? "收起字段" : "Collapse fields" : zh ? "核对字段与依据" : "Review fields and evidence"}</button>
    {expanded && <div className="catalog-review-expanded">
      <p className="muted">{zh ? "外部结果，依据未核验。" : "External results; evidence unverified."} {item.evidence.pages.length > 0 && (zh ? `依据页码：${item.evidence.pages.map((page) => page + 1).join("、")}。` : `Evidence pages: ${item.evidence.pages.map((page) => page + 1).join(", ")}.`)}
        {zh ? ` 模型自评（未校准）：${item.confidence}/100。` : ` Model self-rating (uncalibrated): ${item.confidence}/100.`}</p>
      <FieldTable fields={showPreserved ? item.fields : changes} />
      <button className="button button--quiet button--small" type="button" aria-expanded={showPreserved} onClick={() => setShowPreserved(!showPreserved)}>
        {showPreserved ? zh ? "只看变化" : "Show changes only" : zh ? "查看保留与未变化的字段" : "Show preserved and unchanged fields"}</button>
    </div>}
  </article>;
}

export function BatchCatalogReview({ preview, selected, onSelectionChange, acknowledgements, onAcknowledge, busy, results }: {
  preview: CatalogPreview; selected: ReadonlySet<string>; onSelectionChange: (ids: ReadonlySet<string>) => void;
  acknowledgements: ReviewAcknowledgements; onAcknowledge: (value: ReviewAcknowledgements) => void; busy: boolean; results: CatalogApplyResult[] | null;
}) {
  const { language } = useLanguage(); const zh = language === "zh-CN";
  const [filter, setFilter] = useState("all"); const [page, setPage] = useState(0);
  const pageSize = 25;
  const completedIds = new Set(results?.filter((result) => result.status === "applied" || result.status === "unchanged").map((result) => result.resourceId));
  const selectable = (item: CatalogPreviewItem) => canSelectCatalogItem(item) && !completedIds.has(item.resourceId);
  const filtered = preview.items.filter((item) => filter === "all" || filter === "selected" && selected.has(item.resourceId)
    || filter === "review" && selectable(item) || filter === "blocked" && !canSelectCatalogItem(item));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize)); const currentPage = Math.min(page, pageCount - 1);
  const requirements = preview.items.filter((item) => selected.has(item.resourceId)).reduce((all, item) => ({
    evidence: all.evidence || item.requiresAcknowledgement.evidence, clear: all.clear || item.requiresAcknowledgement.clear,
    humanConflict: all.humanConflict || item.requiresAcknowledgement.humanConflict,
  }), { ...EMPTY_ACKNOWLEDGEMENTS });
  const acknowledgementLabels = {
    evidence: zh ? "我已核对所选建议的来源与内容，将其作为人工修正提交。" : "I checked the selected suggestions against their sources and submit them as human corrections.",
    humanConflict: zh ? "我确认替换所选条目中标明冲突的人工权威值。" : "I confirm replacing the existing human-authoritative values marked as conflicts in selected items.",
    clear: zh ? "我确认清空所选条目中明确标示为空的字段。" : "I confirm clearing the fields explicitly shown as empty in selected items.",
  };
  return <>
    <p className="catalog-batch-identity">{zh ? "批次" : "Batch"} {preview.batchId} · {preview.items.length} {zh ? "项" : "items"} · {zh ? "计划有效至" : "Plan expires"} {new Date(preview.expiresAt).toLocaleTimeString(language)}</p>
    <p className="batch-catalog-counts" role="status">{Object.entries(preview.counts).filter(([, count]) => count > 0).map(([key, count]) => `${STATUS[key.toLowerCase()]?.[zh ? 0 : 1]} ${count}`).join(" · ")}</p>
    <div className="catalog-review-toolbar"><label>{zh ? "显示" : "Show"} <select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0); }}>
      <option value="all">{zh ? "全部条目" : "All items"}</option><option value="review">{zh ? "可审核" : "Reviewable"}</option><option value="blocked">{zh ? "无法应用" : "Blocked"}</option><option value="selected">{zh ? "已选择" : "Selected"}</option></select></label>
      <button type="button" className="button button--quiet button--small" disabled={busy} onClick={() => onSelectionChange(new Set(filtered.filter(selectable).map((item) => item.resourceId)))}>{zh ? "选择此筛选下可审核条目" : "Select reviewable filtered items"}</button>
      <button type="button" className="button button--quiet button--small" disabled={busy} onClick={() => onSelectionChange(new Set())}>{zh ? "取消选择" : "Clear selection"}</button><strong>{zh ? `已选 ${selected.size}` : `${selected.size} selected`}</strong></div>
    <div className="catalog-review-list">{filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((item) => <ReviewItem key={item.resourceId} item={item} selected={selected.has(item.resourceId)} busy={busy} completed={completedIds.has(item.resourceId)} onToggle={() => {
      const next = new Set(selected); if (next.has(item.resourceId)) next.delete(item.resourceId); else next.add(item.resourceId); onSelectionChange(next);
    }} />)}</div>
    {pageCount > 1 && <nav className="catalog-review-pages" aria-label={zh ? "审核分页" : "Review pages"}><button type="button" className="button button--quiet" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{zh ? "上一页" : "Previous"}</button><span>{currentPage + 1} / {pageCount}</span><button type="button" className="button button--quiet" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>{zh ? "下一页" : "Next"}</button></nav>}
    {selected.size > 0 && <fieldset className="catalog-acknowledgements"><legend>{zh ? "确认所选修改" : "Confirm selected changes"}</legend>
      {(Object.keys(requirements) as Array<keyof ReviewAcknowledgements>).filter((key) => requirements[key]).map((key) => <label key={key}><input type="checkbox" disabled={busy} checked={acknowledgements[key]} onChange={(event) => onAcknowledge({ ...acknowledgements, [key]: event.target.checked })} /><span>{acknowledgementLabels[key]}</span></label>)}
    </fieldset>}
    {results && <section className="catalog-apply-results" aria-label={zh ? "逐项应用结果" : "Per-item apply results"}><h4>{zh ? "逐项结果" : "Per-item results"}</h4><ul>{results.map((result) => <li key={result.resourceId}><span>{result.displayName ?? preview.items.find((item) => item.resourceId === result.resourceId)?.currentFilename}</span><strong>{STATUS[result.status]?.[zh ? 0 : 1]}{result.replayed ? zh ? "（此前已完成）" : " (completed previously)" : ""}</strong></li>)}</ul></section>}
  </>;
}
