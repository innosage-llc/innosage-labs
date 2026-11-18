import { citedSummaryParagraphs, summaryPublicProjection, type DraftSnapshot } from './draftDocumentModel';

type TextNode = {type: 'text'; text: string; marks?: [{type: 'link'; attrs: {href: string}}]};
type Paragraph = { type: 'paragraph'; content?: TextNode[] };

/**
 * Build the existing Draft publish endpoint's snapshot from a reviewed committed
 * revision only. The caller must pass an independently minted public document
 * identifier (never the local recording, transcript or summary document ID).
 * This function constructs data and never contacts the publishing service.
 */
export function buildSummaryPublishSnapshot(
  latest: DraftSnapshot,
  reviewed: Pick<DraftSnapshot,'pageId'|'revision'>,
  publicDocumentId: string,
  createdAt: number,
) {
  if (latest.pageId !== reviewed.pageId || latest.revision !== reviewed.revision) throw new Error('Review the current saved summary before publishing.');
  if (typeof publicDocumentId !== 'string' || !/^pub_(?:rec_)?[a-f0-9]{32}$/.test(publicDocumentId) ||
      !Number.isSafeInteger(createdAt) || createdAt <= 0) throw new Error('A separate public summary identity is required.');
  const projection = summaryPublicProjection(latest);
  const paragraphs: Paragraph[] = citedSummaryParagraphs(projection.text,projection.citations);
  if (projection.citations.length) {
    paragraphs.push({type:'paragraph', content:[{type:'text',text:'Sources'}]});
    for (const source of projection.citations) {
      paragraphs.push({type:'paragraph', content:[{
        type:'text', text:source.title.trim() || source.url,
        marks:[{type:'link',attrs:{href:source.url}}],
      }]});
    }
  }
  return {
    metadata:{title:projection.title,createdAt,authorId:'anonymous',origin:'local-mode'},
    blocks:[{id:publicDocumentId,type:'tiptap',content:JSON.stringify({type:'doc',content:paragraphs})}],
    subpages:[],
    breadcrumbs:[],
  };
}
