# career-transition-support

## Overview

A skill plugin for Claude Code

- Writes and revises Japanese-market resumes (職務経歴書) for IT engineers, following a
  standard 8-section structure and a "subject + action + technical detail + impact" style
  for writing quantified achievement bullets
- Reviews an existing resume against a checklist of review viewpoints that mid-career
  hiring managers value, and points out improvements
- Analyzes a job posting against the resume, scoring a match rate, classifying gaps by
  severity, and flagging concerning wording (workload, culture, compensation)
- Expands a resume achievement into a detailed portfolio case study (6-section structure:
  Overview/Problem/Process/Solution/Results/Learnings) for a GitHub README or portfolio site

## Available Skills

| Skill                      | Description                                                                | Auto-invocation |
| -------------------------- | -------------------------------------------------------------------------- | --------------- |
| `/jp-resume-writer`        | Writes/revises a Japanese IT-engineer resume in markdown                   | Enabled         |
| `/jp-resume-reviewer`      | Reviews an existing resume against a viewpoint checklist                   | Enabled         |
| `/jp-job-posting-analyzer` | Scores match rate against a job posting, analyzes gaps, tailors the resume | Enabled         |
| `/jp-portfolio-case-study` | Expands a project achievement into a detailed case study                   | Enabled         |
| `/help`                    | Lists the skills and commands this plugin provides | Disabled        |

## File Structure

| File                                      | Role                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `skills/jp-resume-writer/SKILL.md`        | Resume writing standard structure, achievement wording, quantification methods |
| `skills/jp-resume-reviewer/SKILL.md`      | Review viewpoint checklist with weak/strong examples for an existing resume    |
| `skills/jp-job-posting-analyzer/SKILL.md` | Match-rate scoring, gap analysis, red-flag detection, resume tailoring         |
| `skills/jp-portfolio-case-study/SKILL.md` | Case-study expansion for GitHub README / portfolio site                        |
| `skills/help/SKILL.md`                    | Lists the skills and commands this plugin provides |

## Notes

- All four skills are written in Japanese and target the Japanese IT hiring market
  specifically (agent-mediated hiring flow, 職務経歴書 conventions, ATS-light screening)
- The skills cross-reference each other (resume writing → resume review → job-posting match →
  portfolio case study) and are designed to be used together
- `jp-resume-writer` creates and revises a resume, while `jp-resume-reviewer` only evaluates a
  finished resume against the review viewpoints
