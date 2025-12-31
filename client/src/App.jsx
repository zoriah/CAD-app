import React, { Suspense, useMemo, useState } from "react";
import { Box, Button, Container, Typography, CircularProgress, Stack } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const CadApp = React.lazy(() => import("./CadApp.jsx"));

export default function App() {
  const [open, setOpen] = useState(false);

  const theme = useMemo(() => createTheme({
    palette: {
      mode: "dark",
      primary: { main: "#67b7ff" },
      background: { default: "#0f1116", paper: "#171c2b" }
    },
    shape: { borderRadius: 14 }
  }), []);

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", py: 4 }}>
        {!open ? (
          <Container maxWidth="md">
            <Box sx={{ p: 3, bgcolor: "background.paper", borderRadius: 4, boxShadow: 2 }}>
              <Typography variant="h5" sx={{ fontWeight: 900, fontSize: { xs: 18, sm: 22 } }}>
                CAD Viewer
              </Typography>
              <Typography sx={{ mt: 1, color: "text.secondary", fontSize: { xs: 13, sm: 14 } }}>
                Der Viewer wird erst beim Öffnen geladen (Lazy Load). Dadurch bleibt die Startseite schnell.
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={() => setOpen(true)}
                  sx={{ px: 2.2, py: 1.1, fontSize: { xs: 13, sm: 14 }, fontWeight: 800, textTransform: "none" }}
                  fullWidth
                >
                  Viewer öffnen
                </Button>

                <Button
                  variant="outlined"
                  onMouseEnter={() => import("./CadApp.jsx")}
                  sx={{ px: 2.2, py: 1.1, fontSize: { xs: 13, sm: 14 }, fontWeight: 800, textTransform: "none" }}
                  fullWidth
                >
                  Vorladen
                </Button>
              </Stack>

              <Typography sx={{ mt: 2, color: "text.secondary", fontSize: { xs: 12, sm: 13 } }}>
                Tipp: Du kannst auch eine <b>.zip</b> mit mehreren Dateien (Model + Texturen) direkt droppen.
              </Typography>
            </Box>
          </Container>
        ) : (
          <Suspense
            fallback={
              <Container maxWidth="md">
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, mt: 8 }}>
                  <CircularProgress />
                  <Typography sx={{ color: "text.secondary" }}>Lade CAD Viewer…</Typography>
                </Box>
              </Container>
            }
          >
            <CadApp />
          </Suspense>
        )}
      </Box>
    </ThemeProvider>
  );
}
