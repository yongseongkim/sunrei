import SourceForm from '@/components/SourceForm';

export default async function EditSourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SourceForm mode="edit" sourceId={id} />;
}
