CREATE POLICY "Admins can delete settings"
ON public.site_settings
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));