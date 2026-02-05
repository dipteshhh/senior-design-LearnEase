import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const zodError = error as ZodError<T>;
        res.status(400).json({
          error: "Validation failed",
          details: zodError.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
}

const MAX_TEXT_LENGTH = 50000;

export function validateTextLength(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const text = req.body?.text;
  if (typeof text === "string" && text.length > MAX_TEXT_LENGTH) {
    res.status(400).json({
      error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters`,
    });
    return;
  }
  next();
}
