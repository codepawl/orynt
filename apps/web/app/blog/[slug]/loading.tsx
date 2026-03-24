import { Spin, Flex } from "antd";

export default function Loading() {
  return (
    <Flex
      justify="center"
      align="center"
      style={{
        minHeight: "60vh",
        width: "100%",
      }}
    >
      <Spin size="large" />
    </Flex>
  );
}
