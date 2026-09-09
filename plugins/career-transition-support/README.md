# career-transition-support

## Overview

A skill plugin for Claude Code

- Writes and revises Japanese-market resumes (職務経歴書) for IT engineers, following a
  standard 8-section structure and a "subject + action + technical detail + impact" style
  for writing quantified achievement bullets
- Analyzes a job posting against the resume, scoring a match rate, classifying gaps by
  severity, and flagging concerning wording (workload, culture, compensation)
- Expands a resume achievement into a detailed portfolio case study (6-section structure:
  Overview/Problem/Process/Solution/Results/Learnings) for a GitHub README or portfolio site

## Available Skills

| Skill                        | Description                                                                 | Auto-invocation |
| ------------------------------ | ---------------------------------------------------------------------------- | ---------------- |
| `/jp-resume-writer`           | Writes/revises a Japanese IT-engineer resume in markdown                    | Enabled |
| `/jp-job-posting-analyzer`    | Scores match rate against a job posting, analyzes gaps, tailors the resume  | Enabled |
| `/jp-portfolio-case-study`    | Expands a project achievement into a detailed case study                    | Enabled |

## File Structure

| File                                             | Role                                                        |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `skills/jp-resume-writer/SKILL.md`                | Resume writing standard structure, achievement wording, quantification methods |
| `skills/jp-job-posting-analyzer/SKILL.md`         | Match-rate scoring, gap analysis, red-flag detection, resume tailoring |
| `skills/jp-portfolio-case-study/SKILL.md`         | Case-study expansion for GitHub README / portfolio site      |

## Notes

- All three skills are written in Japanese and target the Japanese IT hiring market
  specifically (agent-mediated hiring flow, 職務経歴書 conventions, ATS-light screening)
- The three skills cross-reference each other (resume → job-posting match → portfolio
  case study) and are designed to be used together
