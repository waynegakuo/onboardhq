export const CHAT_WITH_FILE_SEARCH_SYSTEM_PROMPT = `
      You are the Onboard HQ Assistant, a specialized tool for employees and new hires.
      Your primary role is to help the team navigate company policies, procedures, and general information by retrieving and analyzing data from the internal knowledge base (employee handbooks, benefit guides, remote work policies, and administrative documents).

      **Boundaries & Guidelines:**
      1. **Internal Context Only:** Focus on information relevant to Onboard HQ's internal operations and policies. If a question is entirely unrelated to the company or the documents provided, politely inform the user that you are designed to assist with Onboard HQ administrative and HR tasks.
      2. **Accuracy & Citations:** Always base your answers on the retrieved documents. If the information is found in the knowledge base, provide a clear and concise summary and include the source (e.g., "[Source: Remote_Work_Policy.pdf]").
      3. **Unknown Information:** If the required information is not available in the knowledge base, state clearly: "I couldn't find information regarding [topic] in the current internal documents. Please ensure the relevant document has been uploaded to the knowledge base."
      4. **Tone:** Maintain a professional, helpful, and collaborative tone suitable for a supportive workplace environment.
      5. **Data Privacy:** Do not disclose sensitive personal information if encountered, focusing instead on operational and policy data (e.g., leave policies, office protocols, benefit summaries).

      **Example Interaction:**
      User: "What is our policy on working from home?"
      Assistant: "According to the 'Remote_Work_Policy.pdf', employees are allowed to work from home two days a week, provided it is coordinated with their direct manager."

      User: "Who is the president of France?"
      Assistant: "I am designed to assist with Onboard HQ administrative and HR tasks and do not have information about global political figures in the internal knowledge base."
    `;

/**
 * User-facing replies for when the knowledge base (File Search store) cannot be
 * reached. These are returned as ordinary assistant messages rather than thrown,
 * so the user is told what is actually wrong and what to do next, instead of
 * seeing a generic client-side error.
 */
export const KNOWLEDGE_BASE_FALLBACK = {
  /** No File Search store has ever been registered in Firestore. */
  notInitialized: (storeName: string) => `
I can't reach the knowledge base right now, so I don't have any company documents to answer from.

**What's wrong:** the knowledge base (**${storeName}**) hasn't been set up yet — no documents have ever been uploaded.

**What you can do:** head to the **Upload** page and add a document (for example an employee handbook, benefits guide, or policy PDF). The knowledge base is created automatically on the first successful upload, and I'll be able to answer from it right after.
  `.trim(),

  /** The Firestore record exists but is missing the upstream store reference. */
  misconfigured: (storeName: string) => `
I can't reach the knowledge base right now, so I don't have any company documents to answer from.

**What's wrong:** the knowledge base record (**${storeName}**) exists, but it isn't linked to a File Search store — the store reference saved against it is missing, which usually means an earlier upload was interrupted part-way.

**What you can do:** ask an administrator to re-upload a document from the **Upload** page to re-link the store. If it keeps failing, the **obhqFileSearchStores/${storeName}** record may need to be removed so it can be recreated cleanly.
  `.trim(),

  /** The store is registered, but no documents have been indexed into it. */
  empty: () => `
The knowledge base is connected, but it's empty, so there's nothing for me to search.

**What's wrong:** no documents have been indexed yet.

**What you can do:** upload a document on the **Upload** page — handbooks, benefit guides, remote work policies, and similar PDFs or DOCX files all work. Once indexing finishes, ask me again and I'll answer from it.
  `.trim(),

  /** Firestore points at a store that Google no longer has (deleted/expired/wrong project). */
  missingUpstream: () => `
I can't reach the knowledge base right now, so I don't have any company documents to answer from.

**What's wrong:** the knowledge base is registered on our side, but the underlying File Search store no longer exists or isn't accessible. That usually means it was deleted, it expired, or the API credentials now point at a different project.

**What you can do:** ask an administrator to re-upload the documents from the **Upload** page so the store is recreated. In the meantime, I can still help with general Onboard HQ questions that don't need document lookup.
  `.trim(),

  /** File Search is reachable but the lookup itself failed (quota, transient outage). */
  searchUnavailable: () => `
I couldn't search the knowledge base for that one.

**What's wrong:** the document search service didn't respond successfully — this is usually a temporary outage or a rate limit rather than a problem with your question.

**What you can do:** try again in a moment. If it keeps happening, let an administrator know so they can check the Cloud Function logs.
  `.trim(),
} as const;
