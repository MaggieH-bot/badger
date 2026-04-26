# Pipeline Manager MVP — Build Start

## Goal
Build a lightweight web app for a real estate team to proactively manage active opportunities and transactions from first lead through closing.

This is not a CRM.
This is not a past-client nurture tool.
This is not a marketing automation system.

## Product Boundary
The app manages active real estate opportunities and transactions only.

Included:
- lead through closed pipeline
- urgency scoring based on last contact date
- daily prioritized Today view
- pipeline view by stage
- all deals table
- deal detail drawer
- contact log, notes, and text-only documents
- assignee filtering

Excluded from MVP:
- SOI nurture
- past-client campaigns
- email automation
- calendar sync
- Gmail sync
- file uploads
- role-based auth
- task lists
- mobile app
- external integrations

## Canonical Stages
- lead
- prospect
- active
- under_contract
- closing
- closed

## Stage Thresholds
- lead: 7 days
- prospect: 5 days
- active: 3 days
- under_contract: 1 day
- closing: 1 day
- closed: null

## Urgency Rules
- daysSinceContact / threshold >= 1.0 => cold
- daysSinceContact / threshold >= 0.6 => warming
- daysSinceContact / threshold < 0.6 => on_track
- closed deals have no urgency
- closed deals do not appear in Today view
- logging contact sets lastContact to today
- changing stage does not reset lastContact

## MVP Views
1. Today view
2. Pipeline view
3. All Deals table
4. Deal drawer with:
   - Details
   - Log & Notes
   - Documents

## Storage
- localStorage only
- storage key: pipeline_manager_v1

## Core Deal Fields
- id
- clientName
- address
- phone
- email
- price
- stage
- assignedTo
- lastContact
- nextAction
- createdAt
- updatedAt
- contactLog[]
- notes[]
- documents[]

## Assignees
- You
- TC
- VA
- Partner

## Key Rules
- Use one canonical stage model only
- Do not invent extra features unless requested
- Do not generate mock marketing copy or polished artifacts
- Build in small steps
- After each step, explain what changed and what still needs work
- Ask before making architectural changes beyond MVP