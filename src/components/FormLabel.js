import React from 'react';
import { Form } from 'react-bootstrap';

const FormLabel = ({ children, required }) => (
  <Form.Label>
    {children}
    {required && <span className="text-danger"> *</span>}
  </Form.Label>
);

export default FormLabel;
