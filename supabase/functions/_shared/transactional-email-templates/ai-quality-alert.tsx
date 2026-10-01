import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  runUrl?: string
  summary?: string
  report?: string
  checkedAt?: string
}

const Email = ({ runUrl, summary, report, checkedAt }: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>La calidad del escaneo AI bajó en el control semanal</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={heading}>Control semanal de calidad del escaneo AI</Heading>
        <Text style={text}>
          El control semanal detectó una caída respecto a la referencia guardada.
        </Text>
        {summary ? <Text style={text}>{summary}</Text> : null}
        {checkedAt ? <Text style={muted}>Revisado: {checkedAt}</Text> : null}
        {runUrl ? (
          <Text style={text}>
            Detalle de la corrida: <Link href={runUrl}>{runUrl}</Link>
          </Text>
        ) : null}
        {report ? (
          <Section style={reportBox}>
            <Text style={pre}>{report}</Text>
          </Section>
        ) : null}
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'AI Scan: la exactitud bajó en el control semanal',
  displayName: 'Aviso de calidad del escaneo AI',
  previewData: {
    runUrl: 'https://github.com/example/repo/actions/runs/1',
    summary: 'Exactitud del total: 92% (referencia 100%).',
    report: 'total accuracy 92.0%\nhallucinated items 2',
    checkedAt: '2026-09-07T13:00:00.000Z',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const heading = { fontSize: '20px', margin: '0 0 12px', color: '#111827' }
const text = { fontSize: '14px', lineHeight: '22px', color: '#1f2937', margin: '0 0 12px' }
const muted = { fontSize: '12px', color: '#6b7280', margin: '0 0 12px' }
const reportBox = {
  backgroundColor: '#f3f4f6',
  borderRadius: '8px',
  padding: '14px 16px',
  margin: '8px 0 0',
}
const pre = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  color: '#111827',
  whiteSpace: 'pre-wrap' as const,
  margin: 0,
}
