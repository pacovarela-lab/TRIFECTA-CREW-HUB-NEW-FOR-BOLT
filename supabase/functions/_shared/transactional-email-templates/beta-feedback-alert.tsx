import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

export interface BetaFeedbackAlertProps {
  companyName?: string
  userEmail?: string
  createdAt?: string
  route?: string
  priority?: string
  severity?: string
  comment?: string
}

const FEEDBACK_INBOX_URL = 'https://trifectaportal.app/feedback'

const row: React.CSSProperties = { fontSize: '14px', margin: '0 0 6px', color: '#111827' }
const label: React.CSSProperties = { color: '#6b7280' }

export const BetaFeedbackAlert = ({
  companyName = '(unknown company)',
  userEmail = '(unknown user)',
  createdAt = '',
  route = '(not captured)',
  priority = 'medium',
  severity = '(not set)',
  comment = '(no comment provided)',
}: BetaFeedbackAlertProps) => (
  <Html>
    <Head />
    <Preview>New Crew Hub Beta Feedback</Preview>
    <Body style={{ backgroundColor: '#f6f7f9', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <Container style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '8px', maxWidth: '560px' }}>
        <Heading style={{ fontSize: '20px', margin: '0 0 16px', color: '#111827' }}>
          New Crew Hub Beta Feedback
        </Heading>
        <Section>
          <Text style={row}><span style={label}>Company: </span>{companyName}</Text>
          <Text style={row}><span style={label}>User: </span>{userEmail}</Text>
          <Text style={row}><span style={label}>Date/time: </span>{createdAt}</Text>
          <Text style={row}><span style={label}>Route: </span>{route}</Text>
          <Text style={row}><span style={label}>Priority: </span>{priority}</Text>
          <Text style={row}><span style={label}>Severity: </span>{severity}</Text>
        </Section>
        <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />
        <Text style={{ ...row, whiteSpace: 'pre-line' }}>{comment}</Text>
        <Button
          href={FEEDBACK_INBOX_URL}
          style={{
            backgroundColor: '#111827',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: '6px',
            fontSize: '14px',
            display: 'inline-block',
            marginTop: '16px',
          }}
        >
          View Feedback
        </Button>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BetaFeedbackAlert,
  subject: 'New Crew Hub Beta Feedback',
  displayName: 'New Crew Hub Beta Feedback',
  to: 'hello@trifectahi.com',
  previewData: {
    companyName: 'Acme Co',
    userEmail: 'tester@example.com',
    createdAt: '2026-08-26T02:31:07.000Z',
    route: '/dashboard',
    priority: 'high',
    severity: 'medium',
    comment: 'The dashboard totals look wrong after switching business area.',
  },
} satisfies TemplateEntry
