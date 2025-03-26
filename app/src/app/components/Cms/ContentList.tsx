import {useCmsFormStore} from '@/app/store/cmsFormStore';
import {Badge, Blockquote, Button, Flex, Heading, Table} from '@radix-ui/themes';
import React from 'react';

export const ContentList: React.FC = () => {
  const content = useCmsFormStore(state => state.content?.content);
  const handlePublish = useCmsFormStore(state => state.handlePublish);
  const handleEdit = useCmsFormStore(state => state.handleEdit);
  const handleDelete = useCmsFormStore(state => state.handleDelete);
  const setPreviewData = useCmsFormStore(state => state.setPreviewData);

  return (
    <Flex className="bg-white shadow rounded-lg" direction="column" gapY="4">
      <Heading as="h2" className="text-xl font-semibold border-b p-6">
        Content List
      </Heading>

      {!content || content.length === 0 ? (
        <Blockquote color="gray" className="m-6 mt-0">
          No content found
        </Blockquote>
      ) : (
        <div className="overflow-x-auto">
          <Table.Root>
            <Table.Header>
              <Table.RowHeaderCell>Slug</Table.RowHeaderCell>
              <Table.RowHeaderCell>Title</Table.RowHeaderCell>
              <Table.RowHeaderCell>Language</Table.RowHeaderCell>
              <Table.RowHeaderCell>Status</Table.RowHeaderCell>
              <Table.RowHeaderCell>Actions</Table.RowHeaderCell>
            </Table.Header>
            <Table.Body>
              {content.map(item => (
                <Table.Row key={item.id}>
                  <Table.Cell>{item.slug}</Table.Cell>
                  <Table.Cell>
                    {item.draft_content?.title || item.published_content?.title || 'No title'}
                  </Table.Cell>
                  <Table.Cell>{item.language}</Table.Cell>
                  <Table.Cell>
                    {item.published_content && item.draft_content ? (
                      <Badge color="blue">New Edits</Badge>
                    ) : item.published_content ? (
                      <Badge color="green">Published</Badge>
                    ) : (
                      <Badge color="orange">Draft</Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gapX="2">
                      <Button
                        onClick={() => handlePublish(item.id)}
                        disabled={!item.draft_content}
                        color="grass"
                      >
                        Publish
                      </Button>
                      <Button onClick={() => handleEdit(item)} color="yellow">
                        Edit
                      </Button>
                      <Button onClick={() => handleDelete(item.id)} color="red">
                        Delete
                      </Button>
                      {Boolean((item.draft_content || item.published_content)?.body) && (
                        <Button
                          onClick={() =>
                            setPreviewData({
                              title: (item.draft_content || item.published_content)?.title || '',
                              body: (item.draft_content || item.published_content)?.body || '',
                            })
                          }
                          color="gray"
                        >
                          Preview
                        </Button>
                      )}
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </div>
      )}
    </Flex>
  );
};
