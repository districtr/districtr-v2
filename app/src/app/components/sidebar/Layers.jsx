import { Heading, CheckboxGroup, Flex } from "@radix-ui/themes";

export default function Layers() {
  return (
    <Flex gap="3" direction="column">
      <Heading as="h3" weight="bold" size="3">
        My painted districts
      </Heading>
      <CheckboxGroup.Root defaultValue={["1"]} name="example">
        <CheckboxGroup.Item value="1">
          Show painted districts
        </CheckboxGroup.Item>
        <CheckboxGroup.Item value="2" disabled>
          Show numbering for painted districts
        </CheckboxGroup.Item>
      </CheckboxGroup.Root>
      <Heading as="h3" weight="bold" size="3">
        Boundaries
      </Heading>
      <CheckboxGroup.Root defaultValue={["1"]} name="example">
        <CheckboxGroup.Item value="1">
          Show county boundaries
        </CheckboxGroup.Item>
        <CheckboxGroup.Item value="2" disabled>
          Show tribes and communities
        </CheckboxGroup.Item>
      </CheckboxGroup.Root>
    </Flex>
  );
}
