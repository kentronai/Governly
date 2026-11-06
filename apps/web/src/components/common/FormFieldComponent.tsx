"use client";

import React from "react";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FormFieldComponentProps {
  control: any;
  name: string;
  label: string;
  placeholder: string;
  description: string;
  fieldType?: "textarea" | "select" | "richtext";
  selectOptions?: { value: string; label: string }[];
}

export const FormFieldComponent: React.FC<FormFieldComponentProps> = ({
  control,
  name,
  label,
  placeholder,
  description,
  fieldType = "richtext",
  selectOptions = [],
}) => {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {fieldType === "select" ? (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="bg-muted!">
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {selectOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : fieldType === "richtext" ? (
              <RichTextEditor
                placeholder={placeholder}
                value={field.value ?? ""}
                onChange={field.onChange}
              />
            ) : (
              <Textarea
                className="bg-muted!"
                placeholder={placeholder}
                {...field}
              />
            )}
          </FormControl>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
