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
  importedAt?: string
}

const Email = ({ runUrl, summary, report, importedAt }: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Resultado de la importación de conciliación bancaria</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={heading}>Importación de conciliación bancaria</Heading>
        {summary ? <Text style={text}>{summary}</Text> : null}
        {importedAt ? <Text style={muted}>Procesado: {importedAt}</Text> : null}
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

const main = { backgroundColor: '#f6f7f9', fontFamily: 'Inter, Arial, sans-serif', padding: '24px 0' }
const container = { backgroundColor: '#ffffff', borderRadius: '12px', margin: '0 auto', maxWidth: '560px', padding: '24px' }
const heading = { fontSize: '20px', margin: '0 0 12px' }
const text = { fontSize: '14px', lineHeight: '22px', margin: '0 0 12px' }
const muted = { color: '#6b7280', fontSize: '12px', margin: '0 0 12px' }
const reportBox = { backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '12px' }
const pre = { fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', lineHeight: '18px', margin: '0', whiteSpace: 'pre-wrap' as const }

export const template = {
  component: Email,
  subject: 'Conciliación: resultado de la importación automática',
  displayName: 'Resultado de importación bancaria',
  previewData: {
    runUrl: 'https://github.com/example/repo/actions/runs/1',
    summary: '201 importados · 2 duplicados · 104 a revisar.',
    report: '- imports/bank/julio.csv: 201 importados, 2 duplicados, 104 a revisar',
    importedAt: '2026-09-07T17:00:00.000Z',
  },
} satisfies TemplateEntry
