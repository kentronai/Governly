import { render, waitFor } from "@testing-library/react";
import { RichTextEditor } from "./RichTextEditor";

describe("RichTextEditor", () => {
  it("shows a value that arrives after it mounted (saved data loads late)", async () => {
    const { container, rerender } = render(
      <RichTextEditor value="" onChange={jest.fn()} />,
    );
    rerender(<RichTextEditor value="<p>Saved answer</p>" onChange={jest.fn()} />);
    await waitFor(() =>
      expect(container.querySelector(".ProseMirror")).toHaveTextContent(
        "Saved answer",
      ),
    );
  });
});
