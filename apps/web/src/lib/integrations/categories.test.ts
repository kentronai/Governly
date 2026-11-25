import { tabOf } from "./categories";

test("warehouses land in Data Platforms whatever Nango calls them", () => {
  expect(tabOf("dev-tools", "snowflake")).toBe("data_platforms");
  expect(tabOf("productivity", "google-bigquery")).toBe("data_platforms");
  expect(tabOf("dev-tools", "github")).toBe("developer_tools");
});
