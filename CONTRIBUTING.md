# Contributing to InnoSage Labs

Thanks for improving these reusable artifacts. We prefer **small, independently useful contributions** over new infrastructure.

## What to submit

- **Workflow / skill:** tell readers when to use it, what it needs, the exact steps, how to check the outcome, what to do when blocked, and what is *not* automated.
- **Example:** include a minimal reproduction, expected result, limitations, and source.
- **Existing public project:** prefer a link to the original repository over copied source or generated docs.

Start with a focused issue or PR. Use a short description, user-visible value, and an example that a stranger could follow.

## Publication and security checklist

Before opening a PR:

- [ ] You are authorized to publish **every included file**; respect third-party copyright, licenses, and attribution.
- [ ] No API keys, OAuth tokens, customer data, private transcripts, sensitive logs, private repositories' Git history, internal hostnames, or personal information.
- [ ] Redact or generate synthetic inputs; don't assume a public-facing example is safe just because it ran privately.
- [ ] Every command is scoped and explained; dangerous operations require clear safeguards.
- [ ] Links point to canonical sources. Do not duplicate independently maintained code or version-specific installation instructions.
- [ ] Test or inspect what you can and describe precisely what **passed, failed, or was not run**. Never invent validation.
- [ ] Explain unsupported environments and known limitations.

For a suspected vulnerability, **do not disclose exploitation details or secrets in a public issue or PR**. Use the relevant upstream project's private security-reporting channel, if available, or contact its maintainer privately through an officially published contact route.

## PR handoff

Provide a concise summary, affected files, verification evidence, manual review steps, and risk notes. A maintainer decides whether to merge. Unless separately authorized, a contribution does not trigger a deployment or a publish-to-social action.

## License

Unless noted otherwise, contributions to files authored in **this** repository are submitted under the repository's [MIT license](LICENSE). Externally linked projects retain their own licenses and policies.
