# Agent Development Guidelines

## Thumb Rule: Mandatory End-to-End Re-Verification

> [!IMPORTANT]
> **The Golden Thumb Rule for Development:**
> Whenever you are working on any task—regardless of scope, size, or domain—once you assume or think the work has been completed properly, you must **never stop at assumption**. You must get clear, definitive proof that the work is completely and correctly done.
>
> **Mandatory Verification Checklist Before Declaring Completion:**
> 1. **Re-verify Everything**: Test and cross-check the full scope of your changes from scratch.
> 2. **Check for Regressions & Breakages**: Proactively inspect if any changes broke functionality, broke types, introduced runtime errors, or affected adjacent components/routes.
> 3. **Validate With Concrete Checks**: Execute type checks (`npx tsc --noEmit`), project builds (`npm run build`), or targeted verification tests to ensure clean execution.
> 4. **Definition of Done**: You have only completed the task successfully when there are **zero errors, zero broken flows, and zero unresolved regressions**.
