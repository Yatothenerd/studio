/* ============================================================
   STUDIO — interactive layer
   GSAP (ScrollTrigger) + anime.js
   Now reads from window.GALLERY_PROJECTS (populated by Supabase)
   ============================================================ */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)")
    .matches;

  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }

  /* ---- Project data: now sourced from Supabase via window.GALLERY_PROJECTS ---- */
  function getProjects() {
    return window.GALLERY_PROJECTS || [];
  }

  document.addEventListener("DOMContentLoaded", function () {
    splitHeadings();
    projectViewer(); // works regardless of motion preference

    if (reduceMotion) {
      // Make sure everything is simply visible.
      document.querySelectorAll(".reveal, .char").forEach((el) => {
        el.style.opacity = 1;
        el.style.transform = "none";
      });
      return;
    }

    animateHeadings();
    revealOnScroll();
    if (finePointer) customCursor();
  });

  // Initialize Masonry when gallery data arrives.
  // Use a flag check because the fetch can resolve before app.js loads.
  function initGallery() {
    const grid = document.querySelector('.grid-scroll-inner');
    if (!grid) return;

    if (window.imagesLoaded) {
      imagesLoaded(grid, function () {
        // Init Masonry
        let msnry = null;
        if (window.Masonry) {
          msnry = new Masonry(grid, {
            itemSelector: '.masonry-item',
            columnWidth: '.masonry-sizer',
            gutter: '.masonry-gutter',
            percentPosition: true,
            transitionDuration: reduceMotion ? 0 : '0.4s'
          });
        }

        // Relayout on resize (debounced)
        let resizeTimer;
        window.addEventListener('resize', () => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => { if (msnry) msnry.layout(); }, 150);
        });

        // Bind click on every card
        document.querySelectorAll('.masonry-item').forEach((item) => {
          item.addEventListener("click", (e) => {
            e.preventDefault();
            const idx = parseInt(item.dataset.index, 10);
            const mediaIdx = parseInt(item.dataset.mediaIndex, 10) ?? 0;
            if (!isNaN(idx)) {
              window.dispatchEvent(new CustomEvent("project:open", { detail: { index: idx, mediaIndex: mediaIdx } }));
            }
          });
        });

        // Scroll-reveal via getBoundingClientRect (works in all envs)
        if (reduceMotion) {
          document.querySelectorAll('.masonry-item').forEach(el => el.classList.add("is-visible"));
        } else {
          let batchIdx = 0;
          function revealVisible() {
            document.querySelectorAll('.masonry-item:not(.is-visible)').forEach((item) => {
              const rect = item.getBoundingClientRect();
              if (rect.top < window.innerHeight - 40 && rect.bottom > 0) {
                const delay = (batchIdx % 5) * 80;
                batchIdx++;
                setTimeout(() => item.classList.add("is-visible"), delay);
              }
            });
          }
          // Defer slightly so Masonry finishes its absolute-position pass
          setTimeout(revealVisible, 0);
          let scrollTimer;
          window.addEventListener('scroll', () => {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(revealVisible, 60);
          }, { passive: true });
        }

        // Custom cursor scale on card hover
        if (finePointer && window.gsap) {
          document.querySelectorAll(".masonry-item").forEach((el) => {
            el.addEventListener("mouseenter", () =>
              gsap.to(document.querySelector(".cursor-ring"), { scale: 1.8, duration: 0.3 })
            );
            el.addEventListener("mouseleave", () =>
              gsap.to(document.querySelector(".cursor-ring"), { scale: 1, duration: 0.3 })
            );
          });
        }
      });
    }
  }

  // Handle the race: data may already be ready when app.js loads
  if (window.GALLERY_READY) {
    initGallery();
  } else {
    window.addEventListener("gallery:data-ready", initGallery, { once: true });
  }

  /* ---- Project card viewer (Polaroid, anime.js) ---- */
  function projectViewer() {
    const viewer = document.getElementById("viewer");
    if (!viewer) return;
    const polaroid = document.getElementById("polaroid");
    const photoContainer = document.querySelector(".polaroid-photo");
    const idxEl = document.getElementById("viewer-index");
    const titleEl = document.getElementById("viewer-title");
    const descEl = document.getElementById("viewer-desc");
    const metaEl = document.getElementById("viewer-meta");
    const caption = viewer.querySelector(".polaroid-caption");
    let current = 0;
    let open = false;

    function fill(i, mediaIdx = 0) {
      const PROJECTS = getProjects();
      const N = PROJECTS.length;
      if (N === 0) return;
      current = ((i % N) + N) % N;
      const p = PROJECTS[current];
      const num = String(current + 1).padStart(2, "0");
      photoContainer.innerHTML = '';
      if (p.media && p.media.length > 0) {
        p.media.forEach((imgUrl, idx) => {
          const img = document.createElement('img');
          img.src = imgUrl;
          img.alt = p.title;
          img.loading = "lazy";
          if (idx === mediaIdx) {
            img.dataset.target = "true";
          }
          photoContainer.appendChild(img);
        });
      } else {
        const img = document.createElement('img');
        img.src = p.image || ("images/" + num + ".svg");
        img.alt = p.title;
        photoContainer.appendChild(img);
      }
      
      idxEl.textContent = "No. " + num;
      titleEl.textContent = p.title;
      descEl.textContent = p.long_desc || p.desc;
      metaEl.innerHTML = p.tags.map((t) => "<span>" + t + "</span>").join("");

      // Scroll target image into view inside polaroid
      const targetImg = photoContainer.querySelector('img[data-target="true"]');
      if (targetImg) {
        setTimeout(() => {
          const containerRect = photoContainer.getBoundingClientRect();
          const imgRect = targetImg.getBoundingClientRect();
          const relativeTop = imgRect.top - containerRect.top;
          polaroid.scrollTop = relativeTop;
        }, 50);
      } else {
        polaroid.scrollTop = 0;
      }
    }

    // swap content with a soft crossfade (prev/next within an open viewer)
    function render(i) {
      fill(i, 0);
      if (window.anime) {
        anime({
          targets: [...photoContainer.children, ...caption.children],
          opacity: [0, 1],
          translateY: [12, 0],
          duration: 500,
          delay: anime.stagger(40),
          easing: "easeOutQuad",
        });
      }
    }

    function show(i, mediaIdx = 0) {
      if (getProjects().length === 0) return;
      fill(i, mediaIdx);
      viewer.classList.add("open");
      viewer.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      open = true;
      if (window.anime) {
        anime.remove(polaroid);
        anime({
          targets: polaroid,
          opacity: [0, 1],
          translateY: [50, 0],
          scale: [0.9, 1],
          rotate: [-7, -2.5], // settles slightly tilted like a real Polaroid
          duration: 750,
          easing: "easeOutExpo",
        });
        anime({
          targets: caption.children,
          opacity: [0, 1],
          translateY: [16, 0],
          delay: anime.stagger(70, { start: 250 }),
          duration: 600,
          easing: "easeOutQuad",
        });
      } else {
        polaroid.style.opacity = 1;
      }
    }

    function hide() {
      if (!open) return;
      const finish = () => {
        viewer.classList.remove("open");
        viewer.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
        open = false;
      };
      if (window.anime) {
        anime.remove(polaroid);
        anime({
          targets: polaroid,
          opacity: [1, 0],
          translateY: [0, 30],
          scale: [1, 0.94],
          duration: 350,
          easing: "easeInQuad",
          complete: finish,
        });
      } else {
        finish();
      }
    }

    window.addEventListener("project:open", (e) => {
      const idx = e.detail.index ?? 0;
      const mediaIdx = e.detail.mediaIndex ?? 0;
      show(idx, mediaIdx);
    });
    document.getElementById("viewer-close").addEventListener("click", hide);
    document.getElementById("viewer-prev").addEventListener("click", () => render(current - 1));
    document.getElementById("viewer-next").addEventListener("click", () => render(current + 1));
    viewer.querySelector(".viewer-backdrop").addEventListener("click", hide);
    document.addEventListener("keydown", (e) => {
      if (!open) return;
      if (e.key === "Escape") hide();
      else if (e.key === "ArrowLeft") render(current - 1);
      else if (e.key === "ArrowRight") render(current + 1);
    });
  }



  /* ---- Split heading text into chars (for anime.js stagger) ---- */
  function splitHeadings() {
    document.querySelectorAll("[data-split]").forEach((el) => {
      const text = el.textContent.trim();
      el.innerHTML = "";
      const frag = document.createDocumentFragment();
      text.split(" ").forEach((word, wi, arr) => {
        const wordSpan = document.createElement("span");
        wordSpan.className = "word";
        word.split("").forEach((ch) => {
          const c = document.createElement("span");
          c.className = "char";
          c.textContent = ch;
          c.style.opacity = 0;
          wordSpan.appendChild(c);
        });
        frag.appendChild(wordSpan);
        if (wi < arr.length - 1) {
          frag.appendChild(document.createTextNode(" "));
        }
      });
      el.appendChild(frag);
    });
  }

  /* ---- anime.js: cinematic heading reveal ---- */
  function animateHeadings() {
    if (!window.anime) return;

    anime
      .timeline({ easing: "easeOutExpo" })
      .add({
        targets: ".hero-title .char",
        translateY: [110, 0],
        opacity: [0, 1],
        rotate: [8, 0],
        duration: 1100,
        delay: anime.stagger(35),
      })
      .add(
        {
          targets: ".hero .reveal, .about-hero .reveal",
          translateY: [24, 0],
          opacity: [0, 1],
          duration: 900,
          delay: anime.stagger(120),
        },
        "-=700"
      );
  }

  /* ---- GSAP ScrollTrigger: fade/slide content blocks ---- */
  function revealOnScroll() {
    if (!window.gsap) return;
    gsap.utils
      .toArray(".reveal")
      .filter((el) => !el.closest(".hero") && !el.closest(".about-hero"))
      .forEach((el) => {
        gsap.fromTo(
          el,
          { y: 40, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: el,
              start: "top 88%",
            },
          }
        );
      });
  }



  /* ---- Custom magnetic cursor ---- */
  function customCursor() {
    if (!window.gsap) return;
    const dot = document.querySelector(".cursor");
    const ring = document.querySelector(".cursor-ring");
    if (!dot || !ring) return;

    const dotX = gsap.quickTo(dot, "x", { duration: 0.15, ease: "power3" });
    const dotY = gsap.quickTo(dot, "y", { duration: 0.15, ease: "power3" });
    const ringX = gsap.quickTo(ring, "x", { duration: 0.45, ease: "power3" });
    const ringY = gsap.quickTo(ring, "y", { duration: 0.45, ease: "power3" });

    window.addEventListener("mousemove", (e) => {
      dotX(e.clientX);
      dotY(e.clientY);
      ringX(e.clientX);
      ringY(e.clientY);
    });

    // Magnetic pull on interactive elements
    document.querySelectorAll("[data-magnetic]").forEach((el) => {
      const mx = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3" });
      const my = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3" });
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        mx((e.clientX - (r.left + r.width / 2)) * 0.35);
        my((e.clientY - (r.top + r.height / 2)) * 0.35);
      });
      el.addEventListener("mouseenter", () =>
        gsap.to(ring, { scale: 2.2, duration: 0.3 })
      );
      el.addEventListener("mouseleave", () => {
        mx(0);
        my(0);
        gsap.to(ring, { scale: 1, duration: 0.3 });
      });
    });

    // Grow ring over masonry items
    document.querySelectorAll(".masonry-item").forEach((el) => {
      el.addEventListener("mouseenter", () =>
        gsap.to(ring, { scale: 1.8, duration: 0.3 })
      );
      el.addEventListener("mouseleave", () =>
        gsap.to(ring, { scale: 1, duration: 0.3 })
      );
    });
  }
})();

