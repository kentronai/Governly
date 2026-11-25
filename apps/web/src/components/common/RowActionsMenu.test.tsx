import { fireEvent, render, screen } from "@testing-library/react";
import { RowActionsMenu } from "./RowActionsMenu";

function open() {
  fireEvent.keyDown(screen.getByRole("button", { name: "Row actions" }), { key: "Enter" });
}

describe("RowActionsMenu", () => {
  it("renders items in order, hides hidden ones, and runs onSelect", () => {
    const view = jest.fn();
    render(
      <RowActionsMenu
        items={[
          { label: "View", onSelect: view },
          { label: "Secret", onSelect: () => {}, hidden: true },
          { label: "Delete", onSelect: () => {}, destructive: true },
        ]}
      />,
    );
    open();
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["View", "Delete"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "View" }));
    expect(view).toHaveBeenCalled();
  });

  it("asks for confirmation before running a confirm action", () => {
    const del = jest.fn();
    render(<RowActionsMenu items={[{ label: "Delete", onSelect: del, destructive: true, confirm: "Gone forever." }]} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(del).not.toHaveBeenCalled();
    expect(screen.getByText("Gone forever.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(del).toHaveBeenCalled();
  });
});
