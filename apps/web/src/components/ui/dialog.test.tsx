import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

// Radix arms its outside-click listener on the next tick.
const tick = () => new Promise((r) => setTimeout(r, 10));

function Harness({ onSave }: { onSave: () => void }) {
  const [open, setOpen] = React.useState(true);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>Edit</DialogTitle>
        <input aria-label="name" />
        <button data-autosave onClick={onSave}>Save</button>
      </DialogContent>
    </Dialog>
  );
}

describe("DialogContent autosave", () => {
  it("saves and stays open when clicking outside after an edit", async () => {
    const onSave = jest.fn();
    render(<Harness onSave={onSave} />);
    fireEvent.input(screen.getByLabelText("name"), { target: { value: "x" } });
    await tick();
    fireEvent.pointerDown(document.body);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("just closes when nothing was edited", async () => {
    const onSave = jest.fn();
    render(<Harness onSave={onSave} />);
    await tick();
    fireEvent.pointerDown(document.body);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
