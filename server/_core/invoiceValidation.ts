/**
 * Invoice Validation Utilities
 * Validates GST invoices and extracted data
 */

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validate GST number format
 * GST format: XXYAIQPRXXXXPXZX (2 digits + 10 alphanumeric + 1 digit + 1 alphanumeric + 1 digit)
 */
export function validateGSTNumber(gstNumber: string): ValidationError | null {
  if (!gstNumber || gstNumber.trim().length === 0) {
    return {
      field: 'vendorGstNumber',
      message: 'GST number is required',
      severity: 'error'
    };
  }

  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstRegex.test(gstNumber.toUpperCase())) {
    return {
      field: 'vendorGstNumber',
      message: `Invalid GST format: ${gstNumber}. Expected format: XXYAIQPRXXXXPXZX`,
      severity: 'error'
    };
  }

  return null;
}

/**
 * Validate vendor name
 */
export function validateVendorName(vendorName: string): ValidationError | null {
  if (!vendorName || vendorName.trim().length === 0) {
    return {
      field: 'vendorName',
      message: 'Vendor name is required',
      severity: 'error'
    };
  }

  if (vendorName.trim().length < 3) {
    return {
      field: 'vendorName',
      message: 'Vendor name must be at least 3 characters',
      severity: 'error'
    };
  }

  return null;
}

/**
 * Validate contact number
 */
export function validateContactNumber(contactNumber: string): ValidationError | null {
  if (!contactNumber || contactNumber.trim().length === 0) {
    return {
      field: 'vendorContactNumber',
      message: 'Contact number is required',
      severity: 'error'
    };
  }

  const phoneRegex = /^[0-9\-\+\(\)\s]{7,}$/;
  if (!phoneRegex.test(contactNumber)) {
    return {
      field: 'vendorContactNumber',
      message: 'Invalid contact number format',
      severity: 'error'
    };
  }

  return null;
}

/**
 * Validate vendor address
 */
export function validateVendorAddress(address: string): ValidationError | null {
  if (!address || address.trim().length === 0) {
    return {
      field: 'vendorAddress',
      message: 'Vendor address is required',
      severity: 'error'
    };
  }

  if (address.trim().length < 10) {
    return {
      field: 'vendorAddress',
      message: 'Address must be at least 10 characters',
      severity: 'error'
    };
  }

  return null;
}

/**
 * Validate PO recipient details
 */
export function validateRecipientName(poToName: string): ValidationError | null {
  if (!poToName || poToName.trim().length === 0) {
    return {
      field: 'poToName',
      message: 'Bill recipient name is required',
      severity: 'error'
    };
  }

  if (poToName.trim().length < 3) {
    return {
      field: 'poToName',
      message: 'Recipient name must be at least 3 characters',
      severity: 'error'
    };
  }

  return null;
}

/**
 * Validate items in PO
 */
export function validateItems(items: any[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!items || items.length === 0) {
    errors.push({
      field: 'items',
      message: 'At least one item is required',
      severity: 'error'
    });
    return errors;
  }

  items.forEach((item, index) => {
    if (!item.name || item.name.trim().length === 0) {
      errors.push({
        field: `items[${index}].name`,
        message: `Item ${index + 1}: Product name is required`,
        severity: 'error'
      });
    }

    if (!item.quantity || parseInt(item.quantity) <= 0) {
      errors.push({
        field: `items[${index}].quantity`,
        message: `Item ${index + 1}: Quantity must be greater than 0`,
        severity: 'error'
      });
    }

    if (!item.valuePerItem || parseFloat(item.valuePerItem) <= 0) {
      errors.push({
        field: `items[${index}].valuePerItem`,
        message: `Item ${index + 1}: Unit price must be greater than 0`,
        severity: 'error'
      });
    }

    if (!item.totalValue || parseFloat(item.totalValue) <= 0) {
      errors.push({
        field: `items[${index}].totalValue`,
        message: `Item ${index + 1}: Total value must be greater than 0`,
        severity: 'error'
      });
    }
  });

  return errors;
}

/**
 * Validate total amount
 */
export function validateTotalAmount(totalValue: string): ValidationError | null {
  if (!totalValue || parseFloat(totalValue) <= 0) {
    return {
      field: 'totalValue',
      message: 'Total amount must be greater than 0',
      severity: 'error'
    };
  }

  return null;
}

/**
 * Validate confidence scores and generate warnings
 */
export function validateConfidenceScores(confidence: any): ValidationError[] {
  const warnings: ValidationError[] = [];
  const lowConfidenceThreshold = 0.7;

  if (!confidence) {
    return warnings;
  }

  if (confidence.vendorName && confidence.vendorName < lowConfidenceThreshold) {
    warnings.push({
      field: 'vendorName',
      message: `Low confidence (${(confidence.vendorName * 100).toFixed(0)}%) - Please verify vendor name`,
      severity: 'warning'
    });
  }

  if (confidence.vendorGstNumber && confidence.vendorGstNumber < lowConfidenceThreshold) {
    warnings.push({
      field: 'vendorGstNumber',
      message: `Low confidence (${(confidence.vendorGstNumber * 100).toFixed(0)}%) - Please verify GST number`,
      severity: 'warning'
    });
  }

  if (confidence.poToName && confidence.poToName < lowConfidenceThreshold) {
    warnings.push({
      field: 'poToName',
      message: `Low confidence (${(confidence.poToName * 100).toFixed(0)}%) - Please verify recipient name`,
      severity: 'warning'
    });
  }

  if (confidence.totalValue && confidence.totalValue < lowConfidenceThreshold) {
    warnings.push({
      field: 'totalValue',
      message: `Low confidence (${(confidence.totalValue * 100).toFixed(0)}%) - Please verify total amount`,
      severity: 'warning'
    });
  }

  return warnings;
}

/**
 * Comprehensive invoice validation
 */
export function validateInvoice(extractedData: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Validate required fields
  const vendorNameError = validateVendorName(extractedData.vendorName);
  if (vendorNameError) errors.push(vendorNameError);

  const gstError = validateGSTNumber(extractedData.vendorGstNumber);
  if (gstError) errors.push(gstError);

  const contactError = validateContactNumber(extractedData.vendorContactNumber);
  if (contactError) errors.push(contactError);

  const addressError = validateVendorAddress(extractedData.vendorAddress);
  if (addressError) errors.push(addressError);

  const recipientError = validateRecipientName(extractedData.poToName);
  if (recipientError) errors.push(recipientError);

  const itemErrors = validateItems(extractedData.items);
  errors.push(...itemErrors);

  const totalError = validateTotalAmount(extractedData.totalValue);
  if (totalError) errors.push(totalError);

  // Validate confidence scores
  const confidenceWarnings = validateConfidenceScores(extractedData.confidence);
  warnings.push(...confidenceWarnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
